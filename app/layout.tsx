import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "一字一念 · 金刚经抄写",
  description: "安静、专注的在线佛经抄写体验。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
