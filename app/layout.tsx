import type { Metadata } from "next";
import "./globals.css";

const [githubOwner = "", githubRepository = ""] = (process.env.GITHUB_REPOSITORY ?? "").split("/");
const githubPagesUrl = githubOwner && githubRepository
  ? githubRepository.endsWith(".github.io")
    ? `https://${githubOwner}.github.io/`
    : `https://${githubOwner}.github.io/${githubRepository}/`
  : "http://localhost:3000/";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? githubPagesUrl),
  title: "一字一念 · 佛經讀寫",
  description: "安靜、專注的在線佛經閱讀與抄寫體驗。",
  openGraph: {
    title: "一字一念",
    description: "金剛經・心經・手機讀寫",
    locale: "zh_Hant",
    type: "website",
    images: [{ url: "og-image.png", width: 1200, height: 630, alt: "一字一念・佛經手機讀寫" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
