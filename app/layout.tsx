import type { Metadata } from "next";
import { Noto_Sans_HK } from "next/font/google";
import "./globals.css";

const noto = Noto_Sans_HK({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SKWSCOUT 紙模型工具 | 3D 模型自動展開",
  description: "免費的網頁工具，自動把 3D 模型展開成可列印的紙模型 PDF",
  authors: [{ name: "SKWSCOUT" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK" className={noto.variable}>
      <body className="bg-brand text-white min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
