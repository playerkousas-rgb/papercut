# SKWSCOUT 紙模型工具

一個免費、開源的網頁工具，幫領袖把 3D 模型自動展開成可列印的紙模型 PDF。

> 風格參考：Canon Creative Park / Nissan GT-R Papercraft / Pinterest 紙模樣式

![SKWSCOUT Papercraft Tool](https://img.shields.io/badge/SKWSCOUT-2026-02133e?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

## ✨ 特色

- ✅ **支援多種 3D 格式**：`.obj` / `.stl` / `.glb` / `.gltf`
- ✅ **智能減面**：用 [meshoptimizer](https://github.com/zeux/meshoptimizer) (WASM) 自動把高面數模型減到合適範圍
- ✅ **三種難度**：小朋友 (40 面) / 青少年 (100 面) / 進階 (250 面)
- ✅ **自動展開**：Spanning-tree unfold + 重疊偵測
- ✅ **完整 PDF 輸出**：封面 + 圖例頁 + 多頁裁切 + 品牌頁
- ✅ **繁體中文介面**（香港）
- ✅ **完全前端運算**：用戶檔案不上傳 server，**隱私 100%、Vercel 部署零 timeout**

## 🚀 部署到 Vercel（3 步搞掂）

1. **Push 到 GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/你的帳號/skwscout-papercraft.git
   git push -u origin main
   ```

2. **在 [vercel.com](https://vercel.com) 連 GitHub repo**
   - New Project → Import → 選 `skwscout-papercraft`
   - 預設設定全部按 Deploy

3. **完成 ✅**
   - 無需環境變數
   - 無需資料庫
   - 無需 API key
   - 完全免費

## 🛠️ 本機開發

```bash
npm install
npm run dev
# → http://localhost:3000
```

## 📁 專案結構

```
skwscout-papercraft/
├── app/
│   ├── layout.tsx          ← 全局 layout + 字型
│   ├── page.tsx            ← 主介面 (上傳→預覽→生成→下載)
│   └── globals.css         ← 全局樣式 (Tailwind + 品牌色)
├── components/
│   └── Preview3D.tsx       ← three.js 3D 預覽器
├── lib/
│   ├── types.ts            ← 共用型別 + 難度設定
│   ├── math.ts             ← 向量運算 + 三角形重疊偵測
│   ├── parsers.ts          ← OBJ / STL / GLB / GLTF 解析
│   ├── decimate.ts         ← meshoptimizer 減面
│   ├── adjacency.ts        ← Mesh 鄰接關係
│   ├── unfold.ts           ← Spanning-tree 展開 + 分島
│   ├── islands.ts          ← 島嶼整理 + 邊配對編號
│   ├── binpack.ts          ← A4 分頁排版
│   ├── pdfBuilder.ts       ← PDF 生成 (封面/圖例/裁切/品牌頁)
│   └── pipeline.ts         ← 完整管線
├── public/
│   └── fonts/              ← (可選) Noto Sans HK ttf
├── next.config.mjs
├── tsconfig.json
├── tailwind.config.ts
└── package.json
```

## 🎨 品牌規格

| 元素 | 值 |
|---|---|
| 主背景 | `#02133e` |
| 次要色 | `#344a82` |
| 強調色 | `#f4b740` (金黃) |
| 字型 | Noto Sans HK |
| 版權 | © 2026 SKWSCOUT |

## 🧠 演算法說明

### 1. 減面 (Decimation)
使用 `meshoptimizer` 的 quadric error metric 算法，保留邊界、保持外形特徵。

### 2. 展開 (Unfolding)
- BFS 遍歷面鄰接圖
- 從第一個面開始，沿共享邊把鄰居「攤平」到 2D 平面
- 若新面與已放置的同島面有**自我重疊**，自動切割成新島

### 3. 山摺/谷摺判斷
比較相鄰兩面的法向量夾角：
- 夾角 < 90° → 山摺（紅色虛線）
- 夾角 ≥ 90° → 谷摺（藍色點線）

### 4. 邊配對編號
每條被切開的邊兩側自動加上**相同數字**的舌片，組裝時數字配對黏合。

### 5. A4 排版
使用 Maximal Rectangles bin-packing，自動決定縮放比例讓所有島嶼塞進最少 A4 頁。

## 🔧 客製化

### 改品牌色
編輯 `tailwind.config.ts`:
```ts
brand: { DEFAULT: "#你的色" }
```

### 加中文字型（PDF 內中文）
1. 下載 [Noto Sans HK Regular ttf](https://fonts.google.com/noto/specimen/Noto+Sans+HK)
2. 放到 `public/fonts/NotoSansHK-Regular.ttf`
3. PDF 內標題會自動用中文字型

### 調整難度
編輯 `lib/types.ts` 的 `DIFFICULTY_CONFIG`：
```ts
youth: { targetFaces: 100, ... }
```

## 📜 授權

MIT License · © 2026 SKWSCOUT
