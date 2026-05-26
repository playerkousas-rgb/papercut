"use client";
import { useState, useRef, useCallback } from "react";
import { Upload, Download, Loader2, Sparkles, FileText, Settings2, RefreshCw, AlertTriangle } from "lucide-react";
import Preview3D from "@/components/Preview3D";
import { runPipeline, type PipelineProgress, type PipelineResult } from "@/lib/pipeline";
import { DIFFICULTY_CONFIG, type Difficulty, type Mesh } from "@/lib/types";
import { parseModel } from "@/lib/parsers";

export default function HomePage() {
  const [file, setFile] = useState<{ name: string; buffer: ArrayBuffer } | null>(null);
  const [mesh, setMesh] = useState<Mesh | null>(null);
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("youth");
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const screenshotRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    setError(null);
    setResult(null);
    if (f.size > 100 * 1024 * 1024) {
      setError(`檔案太大 (${(f.size / 1024 / 1024).toFixed(1)}MB)，請使用 < 100MB 的檔案`);
      return;
    }
    try {
      const buffer = await f.arrayBuffer();
      const baseName = f.name.replace(/\.[^.]+$/, "");
      const parsed = await parseModel(f.name, buffer);
      if (parsed.faces.length === 0) {
        setError("檔案內沒有任何 3D 面，請檢查格式");
        return;
      }
      setFile({ name: f.name, buffer });
      setTitle(baseName);
      setMesh(parsed);
    } catch (e: any) {
      console.error("[Upload] Parse error:", e);
      setError(`解析失敗：${e.message || String(e)}`);
      setFile(null);
      setMesh(null);
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const generate = async () => {
    if (!file) return;
    setProgress({ stage: "parse", progress: 0, message: "開始..." });
    setError(null);
    try {
      const r = await runPipeline(file.name, file.buffer, {
        title: title || "未命名作品",
        difficulty,
        thumbnailDataUrl: screenshotRef.current ?? undefined,
        onProgress: setProgress,
      });
      setResult(r);
    } catch (e: any) {
      console.error("[Pipeline] Error:", e);
      setError(e.message || "生成失敗，請開啟 Console (F12) 查看詳情");
    } finally {
      setProgress(null);
    }
  };

  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(result.pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "papercraft"}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null);
    setMesh(null);
    setResult(null);
    setError(null);
    setTitle("");
    if (inputRef.current) inputRef.current.value = "";
  };

  // 大檔警告
  const isLargeMesh = mesh && mesh.faces.length > 5000;
  const isHugeMesh = mesh && mesh.faces.length > 30000;

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-brand-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-brand font-black text-xl">
            S
          </div>
          <div>
            <h1 className="text-xl font-black tracking-wide">SKWSCOUT</h1>
            <p className="text-xs text-brand-200">紙模型自動展開工具 · PAPERCRAFT TOOL</p>
          </div>
        </div>
        <div className="text-xs text-brand-200 hidden sm:block">
          完全在你的瀏覽器內運算 · 檔案不會上傳到任何伺服器
        </div>
      </header>

      <div className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">
        {/* Step 1: 上傳 */}
        {!file && (
          <>
            <div className="text-center mb-8">
              <h2 className="text-3xl sm:text-4xl font-bold mb-3">
                把任何 3D 模型變成紙模型
              </h2>
              <p className="text-brand-100 text-lg">
                上傳 → 選難度 → 下載可列印 PDF · 30 秒搞定
              </p>
            </div>

            <div
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => inputRef.current?.click()}
              className={`
                cursor-pointer border-2 border-dashed rounded-2xl py-20 px-8 text-center transition-all
                ${isDragging
                  ? "border-accent bg-brand-800 dropzone-active"
                  : "border-brand-600 hover:border-accent hover:bg-brand-800/50"}
              `}
            >
              <Upload className="w-16 h-16 mx-auto mb-4 text-accent" />
              <h3 className="text-2xl font-bold mb-2">點擊或拖放 3D 檔案到這裡</h3>
              <p className="text-brand-200">支援 .OBJ · .STL · .GLB · .GLTF</p>
              <p className="text-brand-300 text-sm mt-2">建議 &lt; 30MB · 大檔會自動減面</p>
              <input
                ref={inputRef}
                type="file"
                accept=".obj,.stl,.glb,.gltf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>

            {error && (
              <div className="mt-6 p-4 rounded-lg bg-red-900/30 border border-red-700 text-red-200">
                ❌ {error}
              </div>
            )}

            <div className="mt-12 grid sm:grid-cols-3 gap-4 text-sm">
              {[
                { icon: <Sparkles className="w-5 h-5" />, title: "智能減面", desc: "高面數模型自動簡化到適合紙模型的範圍" },
                { icon: <Settings2 className="w-5 h-5" />, title: "多種難度", desc: "小朋友 / 青少年 / 進階，自動調整零件數" },
                { icon: <FileText className="w-5 h-5" />, title: "完整 PDF", desc: "封面、圖例、分頁裁切、組裝指南" },
              ].map((f, i) => (
                <div key={i} className="bg-brand-800/40 rounded-xl p-5 border border-brand-700">
                  <div className="text-accent mb-2">{f.icon}</div>
                  <h4 className="font-bold mb-1">{f.title}</h4>
                  <p className="text-brand-200 text-xs leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Step 2: 預覽 + 設定 */}
        {file && mesh && !result && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold flex items-center gap-2">
                  <span className="text-accent">📦</span>
                  {file.name}
                </h3>
                <button onClick={reset} className="text-xs text-brand-300 hover:text-accent flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> 重新上傳
                </button>
              </div>
              <Preview3D
                mesh={mesh}
                className="w-full aspect-square rounded-xl overflow-hidden border border-brand-700"
                onScreenshot={(d) => { screenshotRef.current = d; }}
              />
              <p className="text-xs text-brand-300 mt-2 text-center">
                拖曳旋轉 · 滾輪縮放 · 右鍵平移
              </p>
              <div className="mt-3 bg-brand-800/40 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-brand-200">頂點數</span>
                  <span className="font-mono">{mesh.vertices.length.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-200">面數</span>
                  <span className="font-mono">{mesh.faces.length.toLocaleString()}</span>
                </div>
              </div>

              {isHugeMesh && (
                <div className="mt-3 p-3 rounded-lg bg-yellow-900/30 border border-yellow-700 text-yellow-200 text-xs flex gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>面數很大 ({mesh.faces.length.toLocaleString()})</strong><br />
                    生成時會自動猛減到目標面數，可能需要 30-60 秒。請耐心等候。
                  </div>
                </div>
              )}
              {isLargeMesh && !isHugeMesh && (
                <div className="mt-3 p-3 rounded-lg bg-blue-900/20 border border-blue-700 text-blue-200 text-xs flex gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>面數較多，生成可能需要 10-20 秒</div>
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2 text-brand-100">作品名稱</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-brand-800 border border-brand-600 focus:border-accent focus:outline-none text-white"
                  placeholder="例如：我的小汽車"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-3 text-brand-100">選擇難度</label>
                <div className="space-y-2">
                  {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((k) => {
                    const c = DIFFICULTY_CONFIG[k];
                    return (
                      <button
                        key={k}
                        onClick={() => setDifficulty(k)}
                        className={`
                          w-full text-left p-4 rounded-lg border-2 transition-all
                          ${difficulty === k
                            ? "border-accent bg-accent/10"
                            : "border-brand-600 hover:border-brand-400 bg-brand-800/40"}
                        `}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold">{c.emoji} {c.label}</span>
                          <span className="text-xs text-brand-200">目標 {c.targetFaces} 面</span>
                        </div>
                        <p className="text-xs text-brand-200">{c.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={generate}
                disabled={!!progress}
                className="w-full py-4 rounded-lg bg-accent text-brand font-bold text-lg hover:bg-accent/90 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {progress ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {progress.message}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    生成紙模型 PDF
                  </>
                )}
              </button>

              {progress && (
                <div className="w-full h-2 rounded-full bg-brand-800 overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${progress.progress * 100}%` }}
                  />
                </div>
              )}

              {error && (
                <div className="p-4 rounded-lg bg-red-900/30 border border-red-700 text-red-200 text-sm">
                  ❌ {error}
                  <div className="mt-2 text-xs text-red-300">
                    按 F12 開啟 Console 可以看到更詳細的錯誤訊息
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: 結果 */}
        {result && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-accent/20 flex items-center justify-center">
                <FileText className="w-10 h-10 text-accent" />
              </div>
              <h2 className="text-3xl font-bold mb-2">✅ 完成！</h2>
              <p className="text-brand-200">PDF 已準備好下載</p>
            </div>

            <div className="bg-brand-800/40 border border-brand-700 rounded-xl p-6 mb-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-3xl font-bold text-accent">{result.papercraft.stats.decimatedFaces}</div>
                  <div className="text-xs text-brand-200 mt-1">三角面</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-accent">{result.papercraft.islands.length}</div>
                  <div className="text-xs text-brand-200 mt-1">零件數</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-accent">{result.papercraft.edgePairs.length}</div>
                  <div className="text-xs text-brand-200 mt-1">配對邊</div>
                </div>
              </div>
              {result.papercraft.stats.originalFaces > result.papercraft.stats.decimatedFaces && (
                <p className="text-xs text-brand-300 mt-4">
                  ℹ️ 原始 {result.papercraft.stats.originalFaces.toLocaleString()} 面已自動簡化到 {result.papercraft.stats.decimatedFaces} 面
                </p>
              )}
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={download}
                className="px-8 py-4 rounded-lg bg-accent text-brand font-bold hover:bg-accent/90 transition flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                下載 PDF
              </button>
              <button
                onClick={reset}
                className="px-8 py-4 rounded-lg border-2 border-brand-600 hover:border-accent transition flex items-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                做下一個
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="border-t border-brand-700 px-6 py-4 text-center text-xs text-brand-300">
        © 2026 SKWSCOUT · Built with ❤️ for scout leaders
      </footer>
    </main>
  );
}
