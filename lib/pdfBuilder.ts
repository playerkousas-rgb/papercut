// PDF 生成器 — Canon Creative Park 風格 + SKWSCOUT 品牌
// 必須先載入中文字型才能寫中文，否則用英文 fallback
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

// 中文 → 英文 fallback (萬一字型載入失敗時用)
const ZH_TO_EN: Record<string, string> = {
  "小朋友": "Kids",
  "青少年": "Youth",
  "進階": "Advanced",
  "難度": "Difficulty",
  "預計時間": "Time",
  "零件數量": "Pieces",
  "建議紙張": "Paper",
  "所需工具": "Tools",
  "剪刀": "Scissors",
  "美工刀": "Knife",
  "尺": "Ruler",
  "白膠": "Glue",
  "口紅膠": "Glue stick",
  "圖例": "Legend",
  "剪線": "Cut",
  "山摺": "Mountain fold",
  "谷摺": "Valley fold",
  "黏貼舌片": "Glue tab",
  "配對編號": "Edge numbers",
  "組裝提示": "Assembly tips",
  "零件清單": "Pieces list",
  "裁切頁": "Cut page",
  "感謝使用": "Thank you",
  "卡紙": "cardstock",
  "從外面看凸起": "convex from outside",
  "從外面看凹陷": "concave from outside",
};

// 取出文字中的所有獨特字元，供字型 subset 使用
function collectChars(...strings: string[]): string {
  const set = new Set<string>();
  for (const s of strings) {
    for (const ch of s) set.add(ch);
  }
  return Array.from(set).join("");
}

// 安全寫字：先試中文字型，若失敗用 fallback
function safeText(text: string, hasChineseFont: boolean): string {
  if (hasChineseFont) return text;
  // 把已知中文字串換成英文
  let out = text;
  for (const [zh, en] of Object.entries(ZH_TO_EN)) {
    out = out.split(zh).join(en);
  }
  // 把剩餘任何非 ASCII 字元移除
  out = out.replace(/[^\x00-\x7F]/g, "?");
  return out;
}

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

interface FontPack {
  F: PDFFont;
  FB: PDFFont;
  hasChinese: boolean;
}

export async function buildPDF(opts: PDFOptions): Promise<Uint8Array> {
  const cfg = opts.config ?? A4;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  // 嘗試載入內建中文字型
  let chineseFont: PDFFont | null = null;
  let chineseFontBold: PDFFont | null = null;
  try {
    // 試 .otf 和 .ttf 兩種
    const tryUrls = [
      "/fonts/NotoSansHK-Regular.otf",
      "/fonts/NotoSansHK-Regular.ttf",
    ];
    for (const url of tryUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          chineseFont = await pdf.embedFont(buf, { subset: true });
          chineseFontBold = chineseFont; // 用同一個（沒下載 bold）
          console.log(`[PDF] Loaded Chinese font from ${url}`);
          break;
        }
      } catch (e) {
        console.warn(`[PDF] Failed to load ${url}:`, e);
      }
    }
  } catch (e) {
    console.warn("[PDF] Chinese font loading error:", e);
  }

  const stdFont = await pdf.embedFont(StandardFonts.Helvetica);
  const stdFontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const fonts: FontPack = {
    F: chineseFont ?? stdFont,
    FB: chineseFontBold ?? stdFontBold,
    hasChinese: chineseFont !== null,
  };

  // ───── Page 1: 封面 ─────
  await drawCoverPage(pdf, opts, fonts);

  // ───── Page 2: 圖例 + 零件總覽 ─────
  drawLegendPage(pdf, opts, fonts);

  // ───── Page 3+: 裁切頁 ─────
  for (const page of opts.pages) {
    drawCutPage(pdf, page, opts, fonts, cfg);
  }

  // ───── 最後頁: SKWSCOUT 品牌頁 ─────
  drawBrandPage(pdf, fonts);

  return await pdf.save();
}

// 包裝 drawText，自動 fallback
function drawText(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> },
  fonts: FontPack,
) {
  const safe = safeText(text, fonts.hasChinese);
  try {
    page.drawText(safe, opts);
  } catch (e) {
    // 最後保險：把所有非 ASCII 換成 ?
    const ascii = safe.replace(/[^\x00-\x7F]/g, "?");
    try {
      page.drawText(ascii, opts);
    } catch {
      // 完全放棄
      console.warn("[PDF] drawText failed:", text);
    }
  }
}

async function drawCoverPage(
  pdf: PDFDocument,
  opts: PDFOptions,
  fonts: FontPack,
) {
  const page = pdf.addPage([mmToPt(210), mmToPt(297)]);
  const W = page.getWidth(), H = page.getHeight();
  const { F, FB } = fonts;

  // 頂部品牌 banner
  page.drawRectangle({ x: 0, y: H - mmToPt(30), width: W, height: mmToPt(30), color: COLOR.brand });
  drawText(page, "SKWSCOUT", { x: mmToPt(15), y: H - mmToPt(20), size: 24, font: FB, color: COLOR.white }, fonts);
  drawText(page, "PAPERCRAFT TOOL", { x: mmToPt(15), y: H - mmToPt(27), size: 9, font: F, color: COLOR.accent }, fonts);

  // 標題
  drawText(page, opts.title, { x: mmToPt(15), y: H - mmToPt(55), size: 28, font: FB, color: COLOR.brand }, fonts);

  // 3D 預覽框
  const previewY = H - mmToPt(190);
  if (opts.thumbnailDataUrl) {
    try {
      const base64 = opts.thumbnailDataUrl.split(",")[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const img = opts.thumbnailDataUrl.includes("image/jpeg")
        ? await pdf.embedJpg(bytes)
        : await pdf.embedPng(bytes);
      const aspect = img.width / img.height;
      const maxW = mmToPt(180), maxH = mmToPt(120);
      let w = maxW, h = maxW / aspect;
      if (h > maxH) { h = maxH; w = h * aspect; }
      page.drawImage(img, {
        x: (W - w) / 2,
        y: previewY,
        width: w, height: h,
      });
    } catch (e) {
      console.warn("[PDF] Failed to embed thumbnail:", e);
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
  // Emoji ⭐ 在 standard font 也不支援，這裡用簡單英文符號替代
  const safeEmoji = fonts.hasChinese ? opts.difficultyEmoji : opts.difficultyEmoji.replace(/⭐/g, "*");
  const items = [
    { label: "難度", value: `${safeEmoji} ${opts.difficulty}` },
    { label: "預計時間", value: opts.estimatedTime },
    { label: "零件數量", value: `${opts.result.islands.length}` },
    { label: "建議紙張", value: "A4 卡紙 160-200gsm" },
  ];
  items.forEach((item, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = mmToPt(25) + col * mmToPt(90);
    const y = infoY + mmToPt(35) - row * mmToPt(20);
    drawText(page, item.label, { x, y, size: 9, font: F, color: COLOR.accent }, fonts);
    drawText(page, item.value, { x, y: y - mmToPt(7), size: 14, font: FB, color: COLOR.white }, fonts);
  });

  // 工具
  drawText(page, "所需工具", { x: mmToPt(15), y: mmToPt(55), size: 11, font: FB, color: COLOR.brand }, fonts);
  drawText(page, "剪刀 · 美工刀 · 尺 · 白膠 / 口紅膠", {
    x: mmToPt(15), y: mmToPt(48), size: 10, font: F, color: COLOR.black,
  }, fonts);

  drawFooter(page, fonts, 1);
}

function drawPlaceholderBox(page: PDFPage, y: number) {
  const W = page.getWidth();
  page.drawRectangle({
    x: mmToPt(25), y,
    width: W - mmToPt(50), height: mmToPt(110),
    borderColor: COLOR.lightGray, borderWidth: 1,
  });
}

function drawLegendPage(pdf: PDFDocument, opts: PDFOptions, fonts: FontPack) {
  const page = pdf.addPage([mmToPt(210), mmToPt(297)]);
  const H = page.getHeight();
  const { F, FB } = fonts;

  // 標題
  page.drawRectangle({ x: 0, y: H - mmToPt(20), width: page.getWidth(), height: mmToPt(20), color: COLOR.brand });
  drawText(page, "圖例 · LEGEND", { x: mmToPt(15), y: H - mmToPt(13), size: 14, font: FB, color: COLOR.white }, fonts);

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
    drawText(page, item.label, { x: mmToPt(58), y: y - 2, size: 11, font: F, color: COLOR.black }, fonts);
    y -= mmToPt(12);
  }

  // 黏貼舌片示意
  page.drawRectangle({
    x: mmToPt(20), y: y - mmToPt(8), width: mmToPt(30), height: mmToPt(8),
    color: COLOR.tabFill, borderColor: COLOR.gray, borderWidth: 0.5,
  });
  drawText(page, "黏貼舌片 Glue tab", { x: mmToPt(58), y: y - mmToPt(6), size: 11, font: F, color: COLOR.black }, fonts);
  y -= mmToPt(20);

  // 編號說明
  drawText(page, "配對編號 Edge numbers", { x: mmToPt(20), y, size: 11, font: FB, color: COLOR.brand }, fonts);
  drawText(page, "相同數字的兩條邊要黏在一起 (e.g. 5 - 5)", { x: mmToPt(20), y: y - mmToPt(7), size: 10, font: F, color: COLOR.gray }, fonts);
  y -= mmToPt(20);

  // 組裝提示
  drawText(page, "組裝提示", { x: mmToPt(20), y, size: 12, font: FB, color: COLOR.brand }, fonts);
  const tips = [
    "1. 列印時請選「實際大小」/「100%」,不要縮放",
    "2. 沿黑色實線剪下,沿虛線輕輕劃一刀(不要切斷)後摺",
    "3. 紅色虛線向外摺、藍色點線向內摺",
    "4. 從零件編號 A1 開始組裝,按順序進行",
    "5. 黏貼舌片塗膠後對齊相同編號的邊",
  ];
  y -= mmToPt(8);
  for (const tip of tips) {
    drawText(page, tip, { x: mmToPt(20), y, size: 10, font: F, color: COLOR.black }, fonts);
    y -= mmToPt(6);
  }

  // 零件清單
  y -= mmToPt(10);
  drawText(page, `零件清單 (共 ${opts.result.islands.length} 件)`, {
    x: mmToPt(20), y, size: 12, font: FB, color: COLOR.brand,
  }, fonts);
  y -= mmToPt(8);
  const labels = opts.result.islands.map(i => i.groupLabel).join("  ·  ");
  drawText(page, labels, { x: mmToPt(20), y, size: 10, font: F, color: COLOR.black }, fonts);

  drawFooter(page, fonts, 2);
}

function drawCutPage(
  pdf: PDFDocument,
  pageLayout: PageLayout,
  opts: PDFOptions,
  fonts: FontPack,
  cfg: BinPackConfig,
) {
  const page = pdf.addPage([mmToPt(cfg.pageWidth), mmToPt(cfg.pageHeight)]);
  const H = page.getHeight();
  const { F, FB } = fonts;

  // 頁頭
  drawText(page, `裁切頁 ${pageLayout.pageNumber} / ${opts.pages.length}`, {
    x: mmToPt(cfg.margin), y: H - mmToPt(8),
    size: 9, font: F, color: COLOR.gray,
  }, fonts);

  // 零件編號清單在右上
  const pieceLabels = pageLayout.placements.map(p => p.island.groupLabel).join(" · ");
  drawText(page, pieceLabels, {
    x: mmToPt(cfg.pageWidth - cfg.margin - 50), y: H - mmToPt(8),
    size: 9, font: FB, color: COLOR.brand,
  }, fonts);

  // 計算 edgePair 快查
  const edgePairMap = new Map<string, number>();
  for (const ep of opts.result.edgePairs) {
    edgePairMap.set(`${ep.faceA}_${ep.edgeA}`, ep.number);
    edgePairMap.set(`${ep.faceB}_${ep.edgeB}`, ep.number);
  }

  // 畫每個 island
  for (const placement of pageLayout.placements) {
    drawIsland(page, placement, opts.scale, cfg, edgePairMap, fonts);
  }

  drawFooter(page, fonts, undefined);
}

function drawIsland(
  page: PDFPage,
  placement: PageLayout["placements"][0],
  scale: number,
  cfg: BinPackConfig,
  edgePairMap: Map<string, number>,
  fonts: FontPack,
) {
  const { island, offsetX, offsetY } = placement;
  const H = page.getHeight();
  const baseX = mmToPt(cfg.margin + offsetX);
  const topY = H - mmToPt(cfg.margin + offsetY);
  const { F, FB } = fonts;

  // 轉換函數
  const tx = (x: number) => baseX + mmToPt((x - island.bbox.minX) * scale);
  const ty = (y: number) => topY - mmToPt(cfg.labelHeight) - mmToPt((island.bbox.maxY - y) * scale);

  // 群組編號（在零件下方）
  drawText(page, island.groupLabel, {
    x: baseX,
    y: topY - mmToPt(cfg.labelHeight) + 2,
    size: 14, font: FB, color: COLOR.brand,
  }, fonts);

  // 畫所有三角形（白底）
  for (const t of island.triangles) {
    const path = `M ${tx(t.p0.x)} ${ty(t.p0.y)} L ${tx(t.p1.x)} ${ty(t.p1.y)} L ${tx(t.p2.x)} ${ty(t.p2.y)} Z`;
    page.drawSvgPath(path, { color: COLOR.white, borderColor: COLOR.white, borderWidth: 0.1 });
  }

  // 畫邊
  for (const t of island.triangles) {
    const pts = [t.p0, t.p1, t.p2];
    for (let ei = 0; ei < 3; ei++) {
      const a = pts[ei], b = pts[(ei + 1) % 3];
      const ax = tx(a.x), ay = ty(a.y), bx = tx(b.x), by = ty(b.y);
      const ft = t.foldType[ei];
      const isCut = ft === 0;
      const edgePairNum = edgePairMap.get(`${t.faceIndex}_${ei}`);

      if (isCut && edgePairNum !== undefined) {
        drawGlueTab(page, ax, ay, bx, by, edgePairNum, fonts);
        page.drawLine({
          start: { x: ax, y: ay }, end: { x: bx, y: by },
          color: COLOR.black, thickness: 0.8,
        });
      } else if (isCut) {
        page.drawLine({
          start: { x: ax, y: ay }, end: { x: bx, y: by },
          color: COLOR.black, thickness: 0.8,
        });
      } else if (ft > 0) {
        page.drawLine({
          start: { x: ax, y: ay }, end: { x: bx, y: by },
          color: COLOR.red, thickness: 0.6, dashArray: [3, 2],
        });
      } else {
        page.drawLine({
          start: { x: ax, y: ay }, end: { x: bx, y: by },
          color: COLOR.blue, thickness: 0.6, dashArray: [1, 1.5],
        });
      }
    }
  }
}

function drawGlueTab(
  page: PDFPage,
  ax: number, ay: number, bx: number, by: number,
  num: number, fonts: FontPack,
) {
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
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  drawText(page, String(num), {
    x: mx + nx * tabW * 0.55 - 2,
    y: my + ny * tabW * 0.55 - 2,
    size: 5, font: fonts.F, color: COLOR.gray,
  }, fonts);
}

function drawBrandPage(pdf: PDFDocument, fonts: FontPack) {
  const page = pdf.addPage([mmToPt(210), mmToPt(297)]);
  const W = page.getWidth(), H = page.getHeight();
  const { F, FB } = fonts;
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: COLOR.brand });
  drawText(page, "SKWSCOUT", {
    x: W / 2 - 60, y: H / 2 + 20,
    size: 32, font: FB, color: COLOR.white,
  }, fonts);
  drawText(page, "PAPERCRAFT TOOL", {
    x: W / 2 - 50, y: H / 2 + 5,
    size: 11, font: F, color: COLOR.accent,
  }, fonts);
  page.drawLine({
    start: { x: W / 2 - 30, y: H / 2 - 10 },
    end: { x: W / 2 + 30, y: H / 2 - 10 },
    color: COLOR.accent, thickness: 1,
  });
  drawText(page, "感謝使用 · Thank you for crafting with us", {
    x: W / 2 - 75, y: H / 2 - 25,
    size: 10, font: F, color: COLOR.white,
  }, fonts);
  drawText(page, "(c) 2026 SKWSCOUT. All rights reserved.", {
    x: W / 2 - 70, y: mmToPt(15),
    size: 9, font: F, color: COLOR.white,
  }, fonts);
}

function drawFooter(page: PDFPage, fonts: FontPack, pageNum?: number) {
  const W = page.getWidth();
  drawText(page, `(c) 2026 SKWSCOUT`, {
    x: mmToPt(12), y: mmToPt(5), size: 7, font: fonts.F, color: COLOR.gray,
  }, fonts);
  if (pageNum !== undefined) {
    drawText(page, `P. ${pageNum}`, {
      x: W - mmToPt(20), y: mmToPt(5), size: 7, font: fonts.F, color: COLOR.gray,
    }, fonts);
  }
}
