import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayGuard — 청년 프리랜서 분쟁 정리 AI",
  description:
    "계약서 없이 채팅으로 일하는 청년 프리랜서를 위해, AI가 조건을 기록하고 분쟁이 생기면 증거를 정리해 드려요.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        {/* 한글 가독성용 Pretendard (불러오지 못하면 시스템 글꼴로 대체) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
