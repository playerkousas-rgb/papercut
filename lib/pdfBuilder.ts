// PDF 生成器 — Canon Creative Park 風格 + SKWSCOUT 品牌
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Island, EdgePair, PapercraftResult } from "./types";
import type { PageLayout, BinPackConfig } from "./binpack";
import { A4 } from "./binpack";

const mmToPt = (mm: number) => mm * 2.834645669;

const COLOR = {
  brand: rgb(0x02 / 255, 0x13 / 255, 0x3e / 255),
  brandLight: rgb(0x34 / 255, 0x4a / 255, 0x82 / 255),
  accent: rgb(0xf4 / 255, 0xb7 / 255, 0x40 / 255),
  black: rgb(0, 0, 0),
  white: rgb(1, 1, 1),
  red: rgb(0xe7 / 255, 0x4c / 255, 0x3c / 255),
  blue: rgb(0x34 / 255, 0x98 / 255, 0xdb / 255),
  gray: rgb(0.5, 0.5, 0.5),
  lightGray: rgb(0.85, 0.85, 0.85),
  tabFill: rgb(1, 0.978, 0.9),
};

export interface PDFOptions {
  title: string;
  difficulty: string;
  difficultyEmoji: string;
  estimatedTime: string;
  result: PapercraftResult;
  pages: PageLayout[];
  scale: number;             // 1 mesh unit = scale mm
  config?: BinPackConfig;
  thumbnailDataUrl?: string; // 3D 預覽截圖 (PNG dataURL)
}

export async function buildPDF(opts: PDFOptions): Promise<Uint8Array> {
  const cfg = opts.config ?? A4;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  // 嘗試載入內建 Noto 字型 (繁中)
  let chineseFont: PDFFont | null = null;
  try {
    const fontUrl = "/fonts/NotoSansHK-Regular.ttf";
    const res = await fetch(fontUrl);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      chineseFont = await pdf.embedFont(buf, { subset: true });
    }
  } catch {
    // fallback to standard
  }
  const baseFont = await pdf.embedFont(StandardFonts.Helvetica);
  const baseFontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const F = chineseFont ?? baseFont;
  const FB = chineseFont ?? baseFontBold;

  // ───── Page 1: 封面 ─────
  await drawCoverPage(pdf, opts, F, FB);

  // ───── Page 2: 圖例 + 零件總覽 ─────
  drawLegendPage(pdf, opts, F, FB);

  // ───── Page 3+: 裁切頁 ─────
  for (const page of opts.pages) {
    drawCutPage(pdf, page, opts, F, FB, cfg);
  }

  // ───── 最後頁: SKWSCOUT 品牌頁 ─────
  drawBrandPage(pdf, F, FB);

  return await pdf.save();
}

async function drawCoverPage(
  pdf: PDFDocument,
  opts: PDFOptions,
  F: PDFFont,
  FB: PDFFont,
) {
  const page = pdf.addPage([mmToPt(210), mmToPt(297)]);
  const W = page.getWidth(), H = page.getHeight();

  // 頂部品牌 banner
  page.drawRectangle({ x: 0, y: H - mmToPt(30), width: W, height: mmToPt(30), color: COLOR.brand });
  page.drawText("SKWSCOUT", { x: mmToPt(15), y: H - mmToPt(20), size: 24, font: FB, color: COLOR.white });
  page.drawText("PAPERCRAFT TOOL", { x: mmToPt(15), y: H - mmToPt(27), size: 9, font: F, color: COLOR.accent });

  // 標題
  page.drawText(opts.title, { x: mmToPt(15), y: H - mmToPt(55), size: 28, font: FB, color: COLOR.brand });

  // 3D 預覽框
  const previewY = H - mmToPt(190);
  if (opts.thumbnailDataUrl) {
    try {
      const base64 = opts.thumbnailDataUrl.split(",")[1];
      const img = opts.thumbnailDataUrl.includes("image/jpeg")
        ? await pdf.embedJpg(Uint8Array.from(atob(base64), c => c.charCodeAt(0)))
        : await pdf.embedPng(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
      const aspect = img.width / img.height;
      const maxW = mmToPt(180), maxH = mmToPt(120);
      let w = maxW, h = maxW / aspect;
      if (h > maxH) { h = maxH; w = h * aspect; }
      page.drawImage(img, {
        x: (W - w) / 2,
        y: previewY,
        width: w, height: h,
      });
    } catch {
      drawPlaceholderBox(page, previewY);
    }
  } else {
    drawPlaceholderBox(page, previewY);
  }

  // 資訊卡片
  const infoY = mmToPt(70);
  page.drawRectangle({
    x: mmToPt(15), y: infoY,
    width: W - mmToPt(30), height: mmToPt(50),
    color: COLOR.brand,
  });
  const items = [
    { label: "難度", value: `${opts.difficultyEmoji} ${opts.difficulty}` },
    { label: "預計時間", value: opts.estimatedTime },
    { label: "零件數量", value: `${opts.result.islands.length}` },
    { label: "建議紙張", value: "A4 卡紙 160-200gsm" },
  ];
  items.forEach((item, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = mmToPt(25) + col * mmToPt(90);
    const y = infoY + mmToPt(35) - row * mmToPt(20);
    page.drawText(item.label, { x, y, size: 9, font: F, color: COLOR.accent });
    page.drawText(item.value, { x, y: y - mmToPt(7), size: 14, font: FB, color: COLOR.white });
  });

  // 工具
  page.drawText("所需工具", { x: mmToPt(15), y: mmToPt(55), size: 11, font: FB, color: COLOR.brand });
  page.drawText("剪刀  ·  美工刀  ·  尺  ·  白膠 / 口紅膠", {
    x: mmToPt(15), y: mmToPt(48), size: 10, font: F, color: COLOR.black,
  });

  // 頁腳
  drawFooter(page, F, 1);
}

function drawPlaceholderBox(page: PDFPage, y: number) {
  const W = page.getWidth();
  page.drawRectangle({
    x: mmToPt(25), y,
    width: W - mmToPt(50), height: mmToPt(110),
    borderColor: COLOR.lightGray, borderWidth: 1,
  });
}

function drawLegendPage(pdf: PDFDocument, opts: PDFOptions, F: PDFFont, FB: PDFFont) {
  const page = pdf.addPage([mmToPt(210), mmToPt(297)]);
  const H = page.getHeight();

  // 標題
  page.drawRectangle({ x: 0, y: H - mmToPt(20), width: page.getWidth(), height: mmToPt(20), color: COLOR.brand });
  page.drawText("圖例 · LEGEND", { x: mmToPt(15), y: H - mmToPt(13), size: 14, font: FB, color: COLOR.white });

  // 線條圖例
  const items = [
    { color: COLOR.black, label: "剪線 Cut line", dash: undefined, width: 1.5 },
    { color: COLOR.red, label: "山摺 Mountain fold (從外面看凸起)", dash: [4, 2], width: 1.2 },
    { color: COLOR.blue, label: "谷摺 Valley fold (從外面看凹陷)", dash: [1.5, 1.5], width: 1.2 },
  ];
  let y = H - mmToPt(40);
  for (const item of items) {
    page.drawLine({
      start: { x: mmToPt(20), y }, end: { x: mmToPt(50), y },
      color: item.color, thickness: item.width, dashArray: item.dash,
    });
    page.drawText(item.label, { x: mmToPt(58), y: y - 2, size: 11, font: F, color: COLOR.black });
    y -= mmToPt(12);
  }

  // 黏貼舌片示意
  page.drawRectangle({
    x: mmToPt(20), y: y - mmToPt(8), width: mmToPt(30), height: mmToPt(8),
    color: COLOR.tabFill, borderColor: COLOR.gray, borderWidth: 0.5,
  });
  page.drawText("黏貼舌片 Glue tab", { x: mmToPt(58), y: y - mmToPt(6), size: 11, font: F, color: COLOR.black });
  y -= mmToPt(20);

  // 編號說明
  page.drawText("配對編號 Edge numbers", { x: mmToPt(20), y, size: 11, font: FB, color: COLOR.brand });
  page.drawText("相同數字的兩條邊要黏在一起 (e.g. 5 ↔ 5)", { x: mmToPt(20), y: y - mmToPt(7), size: 10, font: F, color: COLOR.gray });
  y -= mmToPt(20);

  // 組裝提示
  page.drawText("組裝提示", { x: mmToPt(20), y, size: 12, font: FB, color: COLOR.brand });
  const tips = [
    "1. 列印時請選「實際大小」/「100%」，不要縮放",
    "2. 沿黑色實線剪下，沿虛線輕輕劃一刀（不要切斷）後摺",
    "3. 紅色虛線向外摺、藍色點線向內摺",
    "4. 從零件編號 A1 開始組裝，按順序進行",
    "5. 黏貼舌片塗膠後對齊相同編號的邊",
  ];
  y -= mmToPt(8);
  for (const tip of tips) {
    page.drawText(tip, { x: mmToPt(20), y, size: 10, font: F, color: COLOR.black });
    y -= mmToPt(6);
  }

  // 零件清單
  y -= mmToPt(10);
  page.drawText(`零件清單 (共 ${opts.result.islands.length} 件)`, {
    x: mmToPt(20), y, size: 12, font: FB, color: COLOR.brand,
  });
  y -= mmToPt(8);
  const labels = opts.result.islands.map(i => i.groupLabel).join("  ·  ");
  page.drawText(labels, { x: mmToPt(20), y, size: 10, font: F, color: COLOR.black });

  drawFooter(page, F, 2);
}

function drawCutPage(
  pdf: PDFDocument,
  pageLayout: PageLayout,
  opts: PDFOptions,
  F: PDFFont,
  FB: PDFFont,
  cfg: BinPackConfig,
) {
  const page = pdf.addPage([mmToPt(cfg.pageWidth), mmToPt(cfg.pageHeight)]);
  const H = page.getHeight();

  // 頁頭
  page.drawText(`裁切頁 ${pageLayout.pageNumber} / ${opts.pages.length}`, {
    x: mmToPt(cfg.margin), y: H - mmToPt(8),
    size: 9, font: F, color: COLOR.gray,
  });

  // 零件編號清單在右上
  const pieceLabels = pageLayout.placements.map(p => p.island.groupLabel).join(" · ");
  page.drawText(pieceLabels, {
    x: mmToPt(cfg.pageWidth - cfg.margin - 50), y: H - mmToPt(8),
    size: 9, font: FB, color: COLOR.brand,
  });

  // 計算 edgePair 快查
  const edgePairMap = new Map<string, number>();
  for (const ep of opts.result.edgePairs) {
    edgePairMap.set(`${ep.faceA}_${ep.edgeA}`, ep.number);
    edgePairMap.set(`${ep.faceB}_${ep.edgeB}`, ep.number);
  }

  // 畫每個 island
  for (const placement of pageLayout.placements) {
    drawIsland(page, placement, opts.scale, cfg, edgePairMap, F, FB);
  }

  drawFooter(page, F, undefined);
}

function drawIsland(
  page: PDFPage,
  placement: PageLayout["placements"][0],
  scale: number,
  cfg: BinPackConfig,
  edgePairMap: Map<string, number>,
  F: PDFFont,
  FB: PDFFont,
) {
  const { island, offsetX, offsetY } = placement;
  const H = page.getHeight();
  const baseX = mmToPt(cfg.margin + offsetX);
  // pdf-lib 座標：左下原點。我們的 island bbox 用 y-up，但 placement 用 y-down 從頂部排
  // offsetY 是「從可用區頂部往下」的距離
  const topY = H - mmToPt(cfg.margin + offsetY);

  // 轉換函數
  const tx = (x: number) => baseX + mmToPt((x - island.bbox.minX) * scale);
  const ty = (y: number) => topY - mmToPt(cfg.labelHeight) - mmToPt((island.bbox.maxY - y) * scale);

  // 群組編號（在零件下方）
  page.drawText(island.groupLabel, {
    x: baseX,
    y: topY - mmToPt(cfg.labelHeight) + 2,
    size: 14, font: FB, color: COLOR.brand,
  });

  // 畫所有三角形
  for (const t of island.triangles) {
    // 先畫填充（白底 + 淡邊框，避免縫隙）
    const path = `M ${tx(t.p0.x)} ${ty(t.p0.y)} L ${tx(t.p1.x)} ${ty(t.p1.y)} L ${tx(t.p2.x)} ${ty(t.p2.y)} Z`;
    page.drawSvgPath(path, { color: COLOR.white, borderColor: COLOR.white, borderWidth: 0.1 });
  }

  // 畫邊（要在所有面填充完之後畫，避免被覆蓋）
  for (const t of island.triangles) {
    const pts = [t.p0, t.p1, t.p2];
    for (let ei = 0; ei < 3; ei++) {
      const a = pts[ei], b = pts[(ei + 1) % 3];
      const ax = tx(a.x), ay = ty(a.y), bx = tx(b.x), by = ty(b.y);
      const ft = t.foldType[ei];
      const isCut = ft === 0;
      const edgePairNum = edgePairMap.get(`${t.faceIndex}_${ei}`);

      if (isCut && edgePairNum !== undefined) {
        // 剪線 + 黏貼舌片
        drawGlueTab(page, ax, ay, bx, by, edgePairNum, F);
        // 然後再畫黑色實線
        page.drawLine({
          start: { x: ax, y: ay }, end: { x: bx, y: by },
          color: COLOR.black, thickness: 0.8,
        });
      } else if (isCut) {
        // 純剪線（邊界）
        page.drawLine({
          start: { x: ax, y: ay }, end: { x: bx, y: by },
          color: COLOR.black, thickness: 0.8,
        });
      } else if (ft > 0) {
        // 山摺：紅色虛線
        page.drawLine({
          start: { x: ax, y: ay }, end: { x: bx, y: by },
          color: COLOR.red, thickness: 0.6, dashArray: [3, 2],
        });
      } else {
        // 谷摺：藍色點線
        page.drawLine({
          start: { x: ax, y: ay }, end: { x: bx, y: by },
          color: COLOR.blue, thickness: 0.6, dashArray: [1, 1.5],
        });
      }
    }
  }
}

function drawGlueTab(page: PDFPage, ax: number, ay: number, bx: number, by: number, number: number, F: PDFFont) {
  // 舌片向「外側」延伸 (相對於三角形)
  // 簡化：法向量取垂直方向，往一側
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;
  const nx = -dy / len, ny = dx / len;
  const tabW = Math.min(mmToPt(4), len * 0.3);
  const inset = Math.min(tabW * 0.6, len * 0.15);
  const path = `M ${ax} ${ay}
    L ${ax + nx * tabW + (dx / len) * inset} ${ay + ny * tabW + (dy / len) * inset}
    L ${bx + nx * tabW - (dx / len) * inset} ${by + ny * tabW - (dy / len) * inset}
    L ${bx} ${by} Z`;
  page.drawSvgPath(path, {
    color: COLOR.tabFill,
    borderColor: COLOR.gray,
    borderWidth: 0.3,
  });
  // 編號
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  page.drawText(String(number), {
    x: mx + nx * tabW * 0.55 - 2,
    y: my + ny * tabW * 0.55 - 2,
    size: 5, font: F, color: COLOR.gray,
  });
}

function drawBrandPage(pdf: PDFDocument, F: PDFFont, FB: PDFFont) {
  const page = pdf.addPage([mmToPt(210), mmToPt(297)]);
  const W = page.getWidth(), H = page.getHeight();
  // 全頁深藍背景
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: COLOR.brand });
  // SKWSCOUT logo
  page.drawText("SKWSCOUT", {
    x: W / 2 - 60, y: H / 2 + 20,
    size: 32, font: FB, color: COLOR.white,
  });
  page.drawText("PAPERCRAFT TOOL", {
    x: W / 2 - 50, y: H / 2 + 5,
    size: 11, font: F, color: COLOR.accent,
  });
  // 分隔線
  page.drawLine({
    start: { x: W / 2 - 30, y: H / 2 - 10 },
    end: { x: W / 2 + 30, y: H / 2 - 10 },
    color: COLOR.accent, thickness: 1,
  });
  page.drawText("感謝使用 · Thank you for crafting with us", {
    x: W / 2 - 75, y: H / 2 - 25,
    size: 10, font: F, color: COLOR.white,
  });
  // 版權
  page.drawText("© 2026 SKWSCOUT. All rights reserved.", {
    x: W / 2 - 70, y: mmToPt(15),
    size: 9, font: F, color: COLOR.white,
  });
}

function drawFooter(page: PDFPage, F: PDFFont, pageNum?: number) {
  const W = page.getWidth();
  page.drawText(`© 2026 SKWSCOUT`, {
    x: mmToPt(12), y: mmToPt(5), size: 7, font: F, color: COLOR.gray,
  });
  if (pageNum !== undefined) {
    page.drawText(`P. ${pageNum}`, {
      x: W - mmToPt(20), y: mmToPt(5), size: 7, font: F, color: COLOR.gray,
    });
  }
}
